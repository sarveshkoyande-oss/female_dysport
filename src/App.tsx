import { useState, useRef, Suspense, useEffect, useCallback, useMemo, memo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Preload } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, RotateCw, Info, MousePointer2, Trash2, Copy, Check, Activity, Eye, EyeOff, Syringe, Settings } from 'lucide-react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

// Model URL
const MODEL_URL = '/female_head.obj';

// Pre-defined sites removed to allow custom marking
const INITIAL_SITES: any[] = [];

const Wave = memo(function Wave({ position, normal, angle, delay, color, isMarkingMode }: { position: [number, number, number], normal: [number, number, number], angle: number, delay: number, color: string, isMarkingMode: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const maxScale = 1.8; 
  const duration = 2.4; 

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 16, 16, 0, Math.PI * 2, 0, angle), [angle]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = (clock.getElapsedTime() + delay) % duration;
    const progress = t / duration;
    
    const scale = progress * maxScale;
    meshRef.current.scale.setScalar(scale);
    
    if (meshRef.current.material instanceof THREE.MeshBasicMaterial) {
      meshRef.current.material.opacity = (1 - progress) * 0.3;
    }
  });

  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    const dir = new THREE.Vector3(...normal).normalize().multiplyScalar(-1);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return q;
  }, [normal]);

  return (
    <mesh 
      position={position} 
      ref={meshRef} 
      quaternion={quaternion}
      geometry={geometry}
      raycast={isMarkingMode ? () => null : undefined}
    >
      <meshBasicMaterial 
        color={color} 
        transparent 
        depthWrite={false}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
});

const PointWaves = memo(function PointWaves({ position, normal, angle, color, isMarkingMode }: { position: [number, number, number], normal: [number, number, number], angle: number, color: string, isMarkingMode: boolean }) {
  const waveCount = 3; 
  const duration = 2.4; 
  const waves = useMemo(() => 
    Array.from({ length: waveCount }).map((_, i) => i * (duration / waveCount)),
  [waveCount, duration]);

  return (
    <group>
      {waves.map((delay, i) => (
        <Wave key={i} position={position} normal={normal} angle={angle} delay={delay} color={color} isMarkingMode={isMarkingMode} />
      ))}
    </group>
  );
});

const Marker = memo(function Marker({ 
  position, 
  normal = [0, 0, 1],
  angle = Math.PI,
  color, 
  isCustom = false, 
  showWaves = false,
  isSelected = false,
  isMarkingMode = false,
  showVectors = true
}: { 
  position: [number, number, number], 
  normal?: [number, number, number],
  angle?: number,
  color: string, 
  isCustom?: boolean, 
  showWaves?: boolean,
  isSelected?: boolean,
  isMarkingMode?: boolean,
  showVectors?: boolean
}) {
  const normalVec = useMemo(() => new THREE.Vector3(...normal).normalize(), [normal]);
  const markerGeometry = useMemo(() => new THREE.SphereGeometry(isCustom ? 0.06 : 0.08, 12, 12), [isCustom]);
  
  return (
    <group>
      <mesh 
        position={position}
        geometry={markerGeometry}
        raycast={isMarkingMode ? () => null : undefined}
      >
        <meshStandardMaterial 
          color={isSelected ? '#ffffff' : (isCustom ? '#f43f5e' : color)} 
          emissive={isSelected ? '#ffffff' : (isCustom ? '#f43f5e' : color)} 
          emissiveIntensity={isSelected ? 5 : (isCustom ? 3 : 2)} 
          toneMapped={false}
        />
      </mesh>

      {/* Normal Helper Line */}
      {showVectors && (isCustom || isSelected) && (
        // @ts-ignore
        <line raycast={() => null}>
          <bufferGeometry>
            <bufferAttribute 
              attach="attributes-position" 
              count={2} 
              array={new Float32Array([
                ...position,
                position[0] + normalVec.x * 0.3,
                position[1] + normalVec.y * 0.3,
                position[2] + normalVec.z * 0.3
              ])} 
              itemSize={3} 
            />
          </bufferGeometry>
          <lineBasicMaterial color={isSelected ? "#ffffff" : "#f43f5e"} linewidth={2} />
        </line>
      )}

      {showWaves && <PointWaves position={position} normal={normal} angle={angle} color={isCustom ? '#f43f5e' : color} isMarkingMode={isMarkingMode} />}
    </group>
  );
});

function BustModel({ 
  rotation, 
  opacity, 
  showMarkers, 
  customPoints, 
  onModelClick, 
  selectedPointIndex,
  onSelectPoint,
  isMarkingMode,
  showHeadache,
  showVectors,
  onInjection,
  position = [0, 0, 0],
  scale = 1.0
}: { 
  rotation: number, 
  opacity: number, 
  showMarkers: boolean,
  customPoints: { pos: [number, number, number], normal: [number, number, number], angle: number, injected?: boolean }[], 
  onModelClick: (point: THREE.Vector3, normal: THREE.Vector3) => void,
  selectedPointIndex: number | null,
  onSelectPoint: (index: number) => void,
  isMarkingMode: boolean,
  showHeadache: boolean,
  showVectors: boolean,
  onInjection: (point: THREE.Vector3, normal: THREE.Vector3) => void,
  position?: [number, number, number],
  scale?: number
}) {
  const scene = useLoader(OBJLoader, MODEL_URL);
  const groupRef = useRef<THREE.Group>(null);
  const bustXOffset = 0.071;

  const depthScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshStandardMaterial({
          colorWrite: false,
          depthWrite: true,
          side: THREE.FrontSide,
          transparent: false,
        });
      }
    });
    return clone;
  }, [scene]);

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshStandardMaterial({
          color: '#e2e8f0', // Plain light gray/slate color
          roughness: 0.6,
          metalness: 0.1,
          transparent: true,
          opacity: opacity,
          side: THREE.FrontSide,
          depthWrite: false,
        });
      }
    });
  }, [scene, opacity]);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        rotation,
        0.1
      );
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        Math.PI / 180, // Hardcoded 1 degree tilt
        0.1
      );
    }
  });

  const handleClick = (e: any) => {
    e.stopPropagation();
    if (groupRef.current) {
      const localPoint = groupRef.current.worldToLocal(e.point.clone());
      const localNormal = e.face.normal.clone().applyQuaternion(groupRef.current.quaternion.clone().invert());
      
      if (isMarkingMode) {
        onModelClick(localPoint, localNormal);
      } else {
        onInjection(localPoint, localNormal);
      }
    }
  };

  return (
    <group ref={groupRef} position={[0, -0.8, 0]} scale={1.6}>
      <group position={position} scale={scale}>
        <group position={[bustXOffset, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <primitive object={depthScene} />
          <primitive 
            object={scene} 
            onClick={handleClick}
            onPointerDown={(e: any) => isMarkingMode && e.stopPropagation()}
          />
        </group>
      </group>
      
      {/* Initial sites removed to allow custom marking */}

      {customPoints.map((p, idx) => {
        if (p.injected) return null;
        return (
          <group 
            key={`custom-group-${idx}`} 
            onClick={(e) => { 
              e.stopPropagation(); 
              if (isMarkingMode) {
                onSelectPoint(idx); 
              } else {
                onInjection(new THREE.Vector3(...p.pos), new THREE.Vector3(...p.normal));
              }
            }}
          >
            <Marker 
              position={p.pos} 
              normal={p.normal}
              angle={p.angle}
              color="#f43f5e" 
              isCustom 
              showWaves={showHeadache}
              isSelected={selectedPointIndex === idx}
              isMarkingMode={isMarkingMode}
              showVectors={showVectors}
            />
          </group>
        );
      })}
    </group>
  );
}

function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-white z-50">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4"
      />
      <p className="text-lg font-medium tracking-wider animate-pulse">LOADING HUMAN MODEL...</p>
    </div>
  );
}

const getRegion = (p: {pos: [number, number, number]}) => {
  const [x, y, z] = p.pos;
  if (y < -0.5) return 'Trapezius';
  if (y < 0.5 && z < -1.0) return 'Cervical Paraspinal';
  if (y >= 0.5 && y < 1.5 && z < -1.0) return 'Occipitalis';
  if (y >= 1.5 && z < 0.5) return 'Temporalis';
  if (y >= 2.4 && z >= 0.5) return 'Frontalis';
  if (y >= 1.6 && y < 2.4 && z >= 0.5) {
    if (Math.abs(x) < 0.1) return 'Procerus';
    return 'Corrugator';
  }
  return 'Other';
};

export default function App() {
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(0.6);
  const [zoom, setZoom] = useState(20);
  const [modelPosition, setModelPosition] = useState<[number, number, number]>([-0.01, -2.66, -0.54]);
  const [modelScale, setModelScale] = useState(0.177);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showUI, setShowUI] = useState(false);
  const [isMarkingMode, setIsMarkingMode] = useState(false);
  const [isInjectionMode, setIsInjectionMode] = useState(true);
  const [activeInjection, setActiveInjection] = useState<{ pos: [number, number, number], normal: [number, number, number], targetIndex: number | null } | null>(null);
  const [customPoints, setCustomPoints] = useState<{ pos: [number, number, number], normal: [number, number, number], angle: number, injected?: boolean }[]>([
  {
    "pos": [
      0.3249411526423742,
      1.8345145218624372,
      1.3110928388239889
    ],
    "normal": [
      -0.12663923577757216,
      -0.09904103659872801,
      0.9869920855970031
    ],
    "angle": 0.6
  },
  {
    "pos": [
      -0.3249411526423742,
      1.8345145218624372,
      1.3110928388239889
    ],
    "normal": [
      0.12663923577757227,
      -0.09904103659872801,
      0.9869920855970031
    ],
    "angle": 0.6
  },
  {
    "pos": [
      0.24277525904765127,
      2.406816455707994,
      1.2310593399811811
    ],
    "normal": [
      -0.12650686144057027,
      -0.10898675223987112,
      0.9859603956775654
    ],
    "angle": 0.6
  },
  {
    "pos": [
      -0.24277525904765127,
      2.406816455707994,
      1.2310593399811811
    ],
    "normal": [
      0.12650686144057038,
      -0.10898675223987112,
      0.9859603956775654
    ],
    "angle": 0.6
  },
  {
    "pos": [
      0.6391710865651125,
      2.4498838953959057,
      1.0253751461132443
    ],
    "normal": [
      0.7063367468583789,
      0.29628087292531874,
      0.6428888273847458
    ],
    "angle": 0.4
  },
  {
    "pos": [
      -0.6391710865651125,
      2.4498838953959057,
      1.0253751461132443
    ],
    "normal": [
      -0.706336746858379,
      0.29628087292531874,
      0.6428888273847457
    ],
    "angle": 0.4
  },
  {
    "pos": [
      0.8957810609933587,
      -0.7703957341395601,
      -0.73669363694435
    ],
    "normal": [
      0.9730917781308323,
      0.22875280780845939,
      0.027650393377331477
    ],
    "angle": 0.5
  },
  {
    "pos": [
      -0.8957810609933587,
      -0.7703957341395601,
      -0.73669363694435
    ],
    "normal": [
      -0.9730917781308323,
      0.22875280780845939,
      0.027650393377331415
    ],
    "angle": 0.5
  },
  {
    "pos": [
      1.8892541576750082,
      -1.3279186830093486,
      -0.9363872559687345
    ],
    "normal": [
      0.99615178855466,
      0.05077448493357918,
      -0.07143924579026263
    ],
    "angle": 0.3
  },
  {
    "pos": [
      -1.8892541576750082,
      -1.3279186830093486,
      -0.9363872559687345
    ],
    "normal": [
      -0.9961517885546601,
      0.05077448493357918,
      -0.07143924579026234
    ],
    "angle": 0.3
  },
  {
    "pos": [
      1.3159014421077377,
      -1.1254636935544466,
      -0.8545047960486463
    ],
    "normal": [
      0.9491601269435368,
      0.29628087292531874,
      -0.10636116659354738
    ],
    "angle": 0.5
  },
  {
    "pos": [
      -1.3159014421077377,
      -1.1254636935544466,
      -0.8545047960486463
    ],
    "normal": [
      -0.9491601269435368,
      0.29628087292531874,
      -0.10636116659354714
    ],
    "angle": 0.5
  },
  {
    "pos": [
      1.2567478956937088,
      1.6102485240907942,
      -0.11152361845344749
    ],
    "normal": [
      0.9760103482890091,
      0.20923866589141926,
      -0.06019120142301762
    ],
    "angle": 0.6
  },
  {
    "pos": [
      -1.2567478956937088,
      1.6102485240907942,
      -0.11152361845344749
    ],
    "normal": [
      -0.9760103482890091,
      0.20923866589141926,
      -0.06019120142301757
    ],
    "angle": 0.6
  },
  {
    "pos": [
      1.2449470431059568,
      1.7912007872743607,
      0.12878024221408527
    ],
    "normal": [
      0.8667340829225728,
      -0.49618891270599885,
      0.05068128261997088
    ],
    "angle": 0.6
  },
  {
    "pos": [
      -1.2449470431059568,
      1.7912007872743607,
      0.12878024221408527
    ],
    "normal": [
      -0.8667340829225727,
      -0.49618891270599885,
      0.0506812826199711
    ],
    "angle": 0.6
  },
  {
    "pos": [
      1.2913085378429083,
      2.0085940095746198,
      -0.094016893908237
    ],
    "normal": [
      0.798364946068711,
      -0.5803868631552219,
      0.1605132454520376
    ],
    "angle": 0.6
  },
  {
    "pos": [
      -1.2913085378429083,
      2.0085940095746198,
      -0.094016893908237
    ],
    "normal": [
      -0.798364946068711,
      -0.5803868631552219,
      0.16051324545203774
    ],
    "angle": 0.6
  },
  {
    "pos": [
      1.3350104538061556,
      2.012052705117977,
      -0.43418958065029767
    ],
    "normal": [
      0.9981524724975481,
      0.0607588812193859,
      0
    ],
    "angle": 0.6
  },
  {
    "pos": [
      -1.3350104538061556,
      2.012052705117977,
      -0.43418958065029767
    ],
    "normal": [
      -0.9981524724975481,
      0.0607588812193859,
      1.2223842305051388e-16
    ],
    "angle": 0.6
  },
  {
    "pos": [
      0.2828079198751058,
      -0.010138354872240907,
      -1.2965420212776864
    ],
    "normal": [
      -0.03971838657296084,
      -0.2272020946930871,
      -0.9730373363520611
    ],
    "angle": 0.4
  },
  {
    "pos": [
      -0.2828079198751058,
      -0.010138354872240907,
      -1.2965420212776864
    ],
    "normal": [
      0.03971838657296094,
      -0.2272020946930871,
      -0.9730373363520611
    ],
    "angle": 0.4
  },
  {
    "pos": [
      0.48126882636659674,
      0.30574236094471174,
      -1.2594522224674911
    ],
    "normal": [
      0.18130287466284292,
      -0.2659638756089804,
      -0.9467800613183825
    ],
    "angle": 0.4
  },
  {
    "pos": [
      -0.48126882636659674,
      0.30574236094471174,
      -1.2594522224674911
    ],
    "normal": [
      -0.18130287466284323,
      -0.2659638756089804,
      -0.9467800613183825
    ],
    "angle": 0.4
  },
  {
    "pos": [
      0.7685643661155718,
      1.1319729755916876,
      -1.438969835369119
    ],
    "normal": [
      0.3978787476351944,
      0.0007963267107332633,
      -0.9174376643914393
    ],
    "angle": 0.4
  },
  {
    "pos": [
      -0.7685643661155718,
      1.1319729755916876,
      -1.438969835369119
    ],
    "normal": [
      -0.3978787476351945,
      0.0007963267107332633,
      -0.9174376643914391
    ],
    "angle": 0.4
  },
  {
    "pos": [
      0.5252253383950054,
      1.1266385548512714,
      -1.5813915109258927
    ],
    "normal": [
      0.049181738807110374,
      -0.009203543268808336,
      -0.9987474412278654
    ],
    "angle": 0.4
  },
  {
    "pos": [
      -0.5252253383950054,
      1.1266385548512714,
      -1.5813915109258927
    ],
    "normal": [
      -0.04918173880711005,
      -0.009203543268808336,
      -0.9987474412278654
    ],
    "angle": 0.4
  },
  {
    "pos": [
      0.6619590389473553,
      0.9303282549495319,
      -1.3890215086737099
    ],
    "normal": [
      0.2947592595384568,
      0.0007963267107332633,
      -0.9555712138716352
    ],
    "angle": 0.4
  },
  {
    "pos": [
      -0.6619590389473553,
      0.9303282549495319,
      -1.3890215086737099
    ],
    "normal": [
      -0.2947592595384565,
      0.0007963267107332633,
      -0.9555712138716353
    ],
    "angle": 0.4
  },
  {
    "pos": [
      -0.021923989177406653,
      1.816915285208029,
      1.3248880242452605
    ],
    "normal": [
      -0.007489064038419451,
      -0.17824605564949209,
      0.9839574470297111
    ],
    "angle": 0.3
  }
]);
  const [showInfo, setShowInfo] = useState(false);
  const [showHeadache, setShowHeadache] = useState(true);
  const [showVectors, setShowVectors] = useState(false);
  const [copied, setCopied] = useState(false);

  const rotateLeft = () => setRotation(prev => prev - Math.PI / 2);
  const rotateRight = () => setRotation(prev => prev + Math.PI / 2);
  const resetRotation = () => {
    setRotation(0);
    setZoom(20);
  };

  const totalPoints = customPoints.length;
  const injectedCount = customPoints.filter(p => p.injected).length;
  const migraineLevel = totalPoints > 0 ? Math.max(0, Math.min(100, ((totalPoints - injectedCount) / totalPoints) * 100)) : 0;
  const reliefLevel = totalPoints > 0 ? Math.max(0, Math.min(100, (injectedCount / totalPoints) * 100)) : 0;

  const regions = useMemo(() => {
    const groups: Record<string, { total: number, injected: number }> = {
      'Frontalis': { total: 0, injected: 0 },
      'Corrugator': { total: 0, injected: 0 },
      'Procerus': { total: 0, injected: 0 },
      'Temporalis': { total: 0, injected: 0 },
      'Occipitalis': { total: 0, injected: 0 },
      'Cervical Paraspinal': { total: 0, injected: 0 },
      'Trapezius': { total: 0, injected: 0 },
      'Other': { total: 0, injected: 0 }
    };
    customPoints.forEach(p => {
      const region = getRegion(p);
      if (groups[region]) {
        groups[region].total++;
        if (p.injected) groups[region].injected++;
      }
    });
    // Remove empty regions
    Object.keys(groups).forEach(k => {
      if (groups[k].total === 0) delete groups[k];
    });
    return groups;
  }, [customPoints]);

  const getMigraineColor = (level: number) => {
    return '#ef4444';
  };

  const getReliefColor = (level: number) => {
    return '#22c55e';
  };

  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  const handleModelClick = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    setCustomPoints(prev => {
      const original = { 
        pos: [point.x, point.y, point.z] as [number, number, number],
        normal: [normal.x, normal.y, normal.z] as [number, number, number],
        angle: Math.PI / 2
      };
      
      // Create mirrored point across X axis
      const mirrored = {
        pos: [-point.x, point.y, point.z] as [number, number, number],
        normal: [-normal.x, normal.y, normal.z] as [number, number, number],
        angle: Math.PI / 2
      };

      const newPoints = [...prev, original, mirrored];
      setSelectedPointIndex(newPoints.length - 2); // Select the original point
      return newPoints;
    });
  }, []);

  const handleInjection = useCallback((point: THREE.Vector3, normal: THREE.Vector3) => {
    if (activeInjection) return;

    // Find closest point
    let closestIdx = -1;
    let minDist = 0.8; // Vicinity threshold

    customPoints.forEach((p, idx) => {
      const dist = new THREE.Vector3(...p.pos).distanceTo(point);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    if (closestIdx !== -1) {
      // Mark point as injected
      setCustomPoints(prev => prev.map((p, i) => i === closestIdx ? { ...p, injected: true } : p));
      
      const targetPoint = customPoints[closestIdx];

      // Only trigger the glow animation if we actually clicked a valid point
      setActiveInjection({
        pos: targetPoint.pos,
        normal: targetPoint.normal,
        targetIndex: closestIdx
      });
    }
  }, [customPoints, activeInjection]);

  const completeInjection = useCallback(() => {
    setActiveInjection(null);
  }, []);

  const updatePointSpherical = (index: number, phi: number, theta: number) => {
    setCustomPoints(prev => {
      const pairIndex = Math.floor(index / 2) * 2;
      const isOriginal = index % 2 === 0;
      
      return prev.map((p, i) => {
        if (i === pairIndex) { // Original
          const normal: [number, number, number] = [
            Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta)
          ];
          return { ...p, normal };
        }
        if (i === pairIndex + 1) { // Mirrored
          // Mirror theta: PI - theta
          const mirroredTheta = Math.PI - theta;
          const normal: [number, number, number] = [
            Math.sin(phi) * Math.cos(mirroredTheta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(mirroredTheta)
          ];
          return { ...p, normal };
        }
        return p;
      });
    });
  };

  const updatePointAngle = (index: number, value: number) => {
    setCustomPoints(prev => {
      const pairIndex = Math.floor(index / 2) * 2;
      return prev.map((p, i) => (i === pairIndex || i === pairIndex + 1) ? { ...p, angle: value } : p);
    });
  };

  const removePoint = (index: number) => {
    setCustomPoints(prev => {
      const pairIndex = Math.floor(index / 2) * 2;
      return prev.filter((_, i) => i !== pairIndex && i !== pairIndex + 1);
    });
  };

  const clearAllPoints = () => {
    if (window.confirm("Clear all custom points?")) {
      setCustomPoints([]);
    }
  };

  const copyCoordinates = () => {
    const data = JSON.stringify(customPoints, null, 2);
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`relative w-full h-screen bg-slate-950 overflow-hidden font-sans selection:bg-blue-500/30 ${isInjectionMode ? 'injection-cursor' : ''}`}>
      <style>
        {`
          .injection-cursor {
            cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m18 2 4 4'/%3E%3Cpath d='m17 7 3-3'/%3E%3Cpath d='M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5'/%3E%3Cpath d='m9 11 4 4'/%3E%3Cpath d='m5 19-3 3'/%3E%3Cpath d='m14 4 6 6'/%3E%3C/svg%3E") 0 24, auto !important;
          }
          .injection-cursor * {
            cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m18 2 4 4'/%3E%3Cpath d='m17 7 3-3'/%3E%3Cpath d='M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5'/%3E%3Cpath d='m9 11 4 4'/%3E%3Cpath d='m5 19-3 3'/%3E%3Cpath d='m14 4 6 6'/%3E%3C/svg%3E") 0 24, auto !important;
          }
        `}
      </style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(30,58,138,0.2),transparent_70%)]" />

      {/* 2D Green Glow Animation */}
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={activeInjection ? { opacity: [0, 1, 1, 0] } : { opacity: 0 }}
        transition={activeInjection ? { duration: 1.3, times: [0, 0.15, 0.45, 1], ease: "easeInOut" } : { duration: 0 }}
        onAnimationComplete={() => { if (activeInjection) completeInjection(); }}
      >
        <motion.div
          className="absolute w-[150vw] h-[150vh]"
          style={{ background: 'radial-gradient(ellipse at center, rgba(34,197,94,0.45) 0%, rgba(34,197,94,0.15) 35%, rgba(34,197,94,0) 60%)' }}
          initial={{ scale: 0.8 }}
          animate={activeInjection ? { scale: 1.2 } : { scale: 0.8 }}
          transition={activeInjection ? { duration: 1.3, ease: "easeOut" } : { duration: 0 }}
        />
      </motion.div>

      <div className="absolute top-0 left-0 w-full z-50 pointer-events-none p-6">
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div className="pointer-events-auto">
              <motion.h1 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-white text-xl sm:text-3xl font-bold tracking-tighter flex items-center gap-2"
              >
                <span className="w-1.5 h-6 sm:w-2 sm:h-8 bg-blue-500 rounded-full" />
                INJECTION SIMULATOR
              </motion.h1>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute top-1/2 left-4 sm:left-8 -translate-y-1/2 flex gap-4 sm:gap-8 z-40 pointer-events-none items-start scale-75 sm:scale-100 origin-left">
        {/* Migraine Bar */}
        <div className="flex flex-col items-center gap-4">
          <span className="text-xs font-mono text-rose-400">{Math.round(migraineLevel)}%</span>
          <div className="w-4 h-64 bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative shadow-xl">
            <motion.div 
              className="absolute bottom-0 w-full shadow-[0_0_10px_rgba(0,0,0,0.5)]"
              initial={{ height: '100%', backgroundColor: '#ef4444' }}
              animate={{ 
                height: `${migraineLevel}%`,
                backgroundColor: getMigraineColor(migraineLevel)
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="text-xs font-bold text-rose-400 uppercase tracking-widest" style={{ writingMode: 'vertical-rl' }}>Migraine</span>
        </div>

        {/* Relief Bar */}
        <div className="flex flex-col items-center gap-4">
          <span className="text-xs font-mono text-green-400">{Math.round(reliefLevel)}%</span>
          <div className="w-4 h-64 bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative shadow-xl">
            <motion.div 
              className="absolute bottom-0 w-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"
              initial={{ height: '0%', backgroundColor: '#22c55e' }}
              animate={{ 
                height: `${reliefLevel}%`,
                backgroundColor: getReliefColor(reliefLevel)
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="text-xs font-bold text-green-400 uppercase tracking-widest" style={{ writingMode: 'vertical-rl' }}>Relief</span>
        </div>
      </div>

      <header className="absolute top-20 sm:top-24 left-4 sm:left-32 w-[calc(100%-2rem)] sm:w-auto p-4 sm:p-6 flex justify-start items-start z-30 pointer-events-none">
        <div className="flex gap-3 pointer-events-auto">
          <AnimatePresence>
            {showUI && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex gap-3"
              >
                <button 
                  onClick={() => setShowHeadache(!showHeadache)}
                  className={`p-3 backdrop-blur-md border rounded-xl transition-all shadow-xl flex items-center gap-2 ${showHeadache ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'}`}
                  title={showHeadache ? "Disable Headache Simulation" : "Enable Headache Simulation"}
                >
                  <Activity size={20} />
                  <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">
                    {showHeadache ? "Headache ON" : "Simulate Headache"}
                  </span>
                </button>
                <button 
                  onClick={() => setShowVectors(!showVectors)}
                  className={`p-3 backdrop-blur-md border rounded-xl transition-all shadow-xl flex items-center gap-2 ${showVectors ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'}`}
                  title={showVectors ? "Hide Vector Lines" : "Show Vector Lines"}
                >
                  <MousePointer2 size={20} className={showVectors ? "" : "opacity-50"} />
                  <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">
                    {showVectors ? "Vectors ON" : "Show Vectors"}
                  </span>
                </button>
                <button 
                  onClick={() => { setIsInjectionMode(!isInjectionMode); if(!isInjectionMode) setIsMarkingMode(false); }}
                  className={`p-3 backdrop-blur-md border rounded-xl transition-all shadow-xl flex items-center gap-2 ${isInjectionMode ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'}`}
                  title={isInjectionMode ? "Exit Injection Mode" : "Enter Injection Mode"}
                >
                  <Syringe size={20} />
                  <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">
                    {isInjectionMode ? "Injection ON" : "Injection Mode"}
                  </span>
                </button>
                <button 
                  onClick={() => { setIsMarkingMode(!isMarkingMode); if(!isMarkingMode) setIsInjectionMode(false); }}
                  className={`p-3 backdrop-blur-md border rounded-xl transition-all shadow-xl flex items-center gap-2 ${isMarkingMode ? 'bg-rose-500/20 border-rose-500 text-rose-400' : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'}`}
                  title={isMarkingMode ? "Exit Marking Mode" : "Enter Marking Mode"}
                >
                  <MousePointer2 size={20} />
                  <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">
                    {isMarkingMode ? "Marking ON" : "Mark Points"}
                  </span>
                </button>
                <button 
                  onClick={() => setShowInfo(!showInfo)}
                  className="p-3 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-xl text-slate-400 hover:text-white hover:border-slate-700 transition-all shadow-xl"
                >
                  <Info size={20} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className={`relative z-10 w-full h-full ${isMarkingMode ? 'cursor-crosshair' : (isInjectionMode ? 'injection-cursor' : 'cursor-grab active:cursor-grabbing')}`}>
        <Canvas shadows gl={{ antialias: true, alpha: true }}>
          <Suspense fallback={null}>
            <PerspectiveCamera makeDefault position={[0, 0, zoom]} fov={40} />
            <Environment preset="city" />
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
            
            <BustModel 
              rotation={rotation} 
              opacity={opacity} 
              showMarkers={showMarkers} 
              customPoints={customPoints}
              onModelClick={handleModelClick}
              isMarkingMode={isMarkingMode}
              showHeadache={showHeadache}
              selectedPointIndex={selectedPointIndex}
              onSelectPoint={setSelectedPointIndex}
              showVectors={showVectors}
              onInjection={handleInjection}
              position={modelPosition}
              scale={modelScale}
            />
            
            <OrbitControls 
              enablePan={false} 
              enableRotate={false}
              minDistance={3} 
              maxDistance={40}
              enabled={!isMarkingMode}
              makeDefault
            />
            <Preload all />
          </Suspense>
        </Canvas>
      </div>

      <AnimatePresence>
        {showUI && customPoints.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="absolute top-40 sm:top-48 left-4 sm:left-32 w-[calc(100%-2rem)] sm:w-72 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 shadow-3xl z-20 flex flex-col max-h-[40vh] sm:max-h-[50vh]"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-sm tracking-widest uppercase">Coordinates</h3>
              <button onClick={clearAllPoints} className="text-slate-500 hover:text-rose-400 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {Array.from({ length: Math.ceil(customPoints.length / 2) }).map((_, pairIdx) => {
                const i = pairIdx * 2;
                const p = customPoints[i];
                const vec = new THREE.Vector3(...p.normal).normalize();
                const phi = Math.acos(vec.y);
                const theta = Math.atan2(vec.z, vec.x);
                const isSelected = selectedPointIndex === i || selectedPointIndex === i + 1;

                return (
                  <div 
                    key={pairIdx} 
                    onClick={() => setSelectedPointIndex(i)}
                    className={`bg-slate-800/50 p-3 rounded-lg border transition-all cursor-pointer ${isSelected ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-slate-700/50 hover:border-slate-600'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`text-[10px] font-mono font-bold ${isSelected ? 'text-blue-400' : 'text-rose-400'}`}>PAIR #{pairIdx+1}</div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removePoint(i); if(selectedPointIndex === i || selectedPointIndex === i + 1) setSelectedPointIndex(null); }} 
                        className="text-slate-600 hover:text-rose-400 transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    
                    <div className="text-[8px] font-mono text-slate-500 mb-2 space-y-0.5">
                      <div>L: {p.pos[0].toFixed(2)}, {p.pos[1].toFixed(2)}, {p.pos[2].toFixed(2)}</div>
                      {customPoints[i+1] && <div>R: {customPoints[i+1].pos[0].toFixed(2)}, {customPoints[i+1].pos[1].toFixed(2)}, {customPoints[i+1].pos[2].toFixed(2)}</div>}
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Normal Direction (Linked)</span>
                          <span className="text-[8px] font-mono text-blue-400">
                            {((phi * 180) / Math.PI).toFixed(0)}°, {((theta * 180) / Math.PI).toFixed(0)}°
                          </span>
                        </div>
                        <div className="space-y-1">
                          <input 
                            type="range" min="0" max={Math.PI} step="0.01" value={phi} 
                            onChange={(e) => updatePointSpherical(i, parseFloat(e.target.value), theta)}
                            className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-blue-500"
                            title="Elevation"
                          />
                          <input 
                            type="range" min={-Math.PI} max={Math.PI} step="0.01" value={theta} 
                            onChange={(e) => updatePointSpherical(i, phi, parseFloat(e.target.value))}
                            className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-blue-500"
                            title="Azimuth"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Sphere Angle (Linked)</span>
                          <span className="text-[8px] font-mono text-blue-400">{(p.angle * 180 / Math.PI).toFixed(0)}°</span>
                        </div>
                        <input 
                          type="range" min="0.1" max={Math.PI * 2} step="0.1" value={p.angle} 
                          onChange={(e) => updatePointAngle(i, parseFloat(e.target.value))}
                          className="w-full h-1 bg-slate-900 rounded appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800 flex gap-2">
              <button 
                onClick={copyCoordinates}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy XYZ"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUI && (
          <motion.div 
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="absolute top-24 right-6 flex flex-col gap-4 z-10 w-48 pointer-events-none"
          >
            <div className="pointer-events-auto flex flex-col gap-2 bg-slate-900/80 backdrop-blur-md p-3 border border-slate-800 rounded-xl shadow-xl">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Controls</span>
                <button onClick={resetRotation} className="text-[9px] font-bold text-blue-400 hover:text-blue-300 uppercase">Reset</button>
              </div>
              
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">Opacity</span>
                  <span className="text-[9px] font-mono text-blue-400">{Math.round(opacity * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.1" max="1" step="0.01" value={opacity} 
                  onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase">Zoom</span>
                  <span className="text-[9px] font-mono text-blue-400">{zoom.toFixed(1)}</span>
                </div>
                <input 
                  type="range" min="4" max="40" step="0.1" value={zoom} 
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUI && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-4 z-10 w-96 pointer-events-none"
          >
            <div className="pointer-events-auto flex flex-col gap-2 bg-slate-900/80 backdrop-blur-md p-4 border border-slate-800 rounded-xl shadow-xl">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Model Adjustments</span>
              </div>
              
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Scale</span>
                    <span className="text-[9px] font-mono text-blue-400">{Math.round((modelScale / 0.15) * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0.01" max="1.5" step="0.001" value={modelScale} 
                    onChange={(e) => setModelScale(parseFloat(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Pos X (L/R)</span>
                    <span className="text-[9px] font-mono text-blue-400">{modelPosition[0].toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="-10" max="10" step="0.01" value={modelPosition[0]} 
                    onChange={(e) => setModelPosition([parseFloat(e.target.value), modelPosition[1], modelPosition[2]])}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Pos Y (U/D)</span>
                    <span className="text-[9px] font-mono text-blue-400">{modelPosition[1].toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="-10" max="10" step="0.01" value={modelPosition[1]} 
                    onChange={(e) => setModelPosition([modelPosition[0], parseFloat(e.target.value), modelPosition[2]])}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Pos Z (F/B)</span>
                    <span className="text-[9px] font-mono text-blue-400">{modelPosition[2].toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="-10" max="10" step="0.01" value={modelPosition[2]} 
                    onChange={(e) => setModelPosition([modelPosition[0], modelPosition[1], parseFloat(e.target.value)])}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="absolute top-24 right-6 w-80 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-3xl z-20"
          >
            <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
              <Info size={18} className="text-blue-500" />
              Simulator Guide
            </h3>
            <ul className="space-y-4 text-slate-400 text-sm">
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded bg-amber-500 flex items-center justify-center shrink-0 text-[10px] font-bold text-white">SIM</div>
                <p>Toggle <span className="text-amber-400 font-medium">Simulate Headache</span> to visualize propagating pain waves inside the bust.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded bg-rose-500 flex items-center justify-center shrink-0 text-[10px] font-bold text-white">NEW</div>
                <p>Click <span className="text-rose-400 font-medium">Mark Points</span> to enter marking mode. Click anywhere on the model to place a red marker.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center shrink-0 text-[10px] font-bold text-white">1</div>
                <p>Use the <span className="text-blue-400 font-medium">arrows</span> below to rotate the bust precisely by 90 degrees.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center shrink-0 text-[10px] font-bold text-white">2</div>
                <p>Adjust the <span className="text-blue-400 font-medium">transparency slider</span> to reveal internal structures.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center shrink-0 text-[10px] font-bold text-white">3</div>
                <p>Click <span className="text-blue-400 font-medium">Copy XYZ</span> to get the coordinates of your custom markers.</p>
              </li>
            </ul>
            <button 
              onClick={() => setShowInfo(false)}
              className="w-full mt-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors text-xs font-bold uppercase tracking-widest"
            >
              Close
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className="absolute top-20 sm:top-24 right-4 sm:right-6 w-[calc(100%-2rem)] sm:w-64 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-5 shadow-3xl z-20 flex flex-col max-h-[30vh] sm:max-h-none overflow-y-auto sm:overflow-visible"
        >
          <h3 className="text-white font-bold text-sm tracking-widest uppercase mb-4">Injection Sites</h3>
          <div className="space-y-4">
            {Object.entries(regions).map(([region, stats]) => (
              <div key={region} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-medium">{region}</span>
                  <span className="text-slate-300 font-mono">{stats.injected} / {stats.total}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.total > 0 ? (stats.injected / stats.total) * 100 : 0}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="absolute bottom-4 sm:bottom-6 right-4 sm:right-8 z-50 flex gap-3 pointer-events-auto">
        <div className="flex gap-2 bg-slate-900/80 backdrop-blur-md p-2 border border-slate-800 rounded-xl shadow-xl">
          <button onClick={rotateLeft} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all">
            <RotateCcw size={18} />
          </button>
          <button onClick={rotateRight} className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all">
            <RotateCw size={18} />
          </button>
        </div>
      </div>

      <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-8 z-50 flex gap-3 pointer-events-auto items-center">
        <button 
          onClick={() => setShowUI(!showUI)}
          className={`p-3 backdrop-blur-md border rounded-xl transition-all shadow-xl flex items-center justify-center ${showUI ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900/80 border-slate-800 text-slate-500 hover:text-slate-300'}`}
          title={showUI ? "Hide Controls" : "Show Controls"}
        >
          <Settings size={18} className={showUI ? "animate-spin-slow" : ""} />
        </button>
        <div className="pointer-events-none opacity-30 ml-2">
          <p className="text-white text-[10px] font-bold tracking-[0.3em] uppercase">Visual Core v1.0</p>
        </div>
      </div>
    </div>
  );
}
