import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

const STAR_COUNT = 15;
const RADIUS = 1.2; // Collision radius approximation

const Star = ({ position, velocity, updatePosition, index, color }) => {
    const meshRef = useRef();
    const [hovered, setHover] = useState(false);

    // Random rotation speed
    const rotationSpeed = useMemo(() => ({
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02
    }), []);

    useFrame((state) => {
        if (!meshRef.current) return;

        // Rotation (Twinkle effect)
        meshRef.current.rotation.x += rotationSpeed.x;
        meshRef.current.rotation.y += rotationSpeed.y;

        // Hover scale effect
        const targetScale = hovered ? 1.4 : 1.0;
        meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

        // Update visual position from the shared physics state
        // The actual position update happens in the parent useFrame, 
        // but we need to sync the mesh to it.
        // Actually, simpler to let parent handle position or pass a mutable ref.
        // Let's rely on the parent updating the position prop? No, props don't update on frame rapidly.
        // We will read from a shared ref array passed down.
    });

    return (
        <mesh
            ref={(el) => {
                meshRef.current = el;
                if (updatePosition) updatePosition(index, el);
            }}
            position={position} // Initial position
            rotation={[Math.PI / 4, Math.PI / 4, 0]} // Initial Diamond Rotation
            onPointerOver={() => setHover(true)}
            onPointerOut={() => setHover(false)}
        >
            <RoundedBox args={[0.9, 0.9, 0.9]} radius={0.2} smoothness={8}>
                <meshStandardMaterial
                    color={color}
                    roughness={0.2}
                    metalness={0.8}
                    envMapIntensity={1.5}
                />
            </RoundedBox>
        </mesh>
    );
};

const PhysicsScene = () => {
    const { viewport } = useThree();

    // Store physics state in refs to avoid re-renders
    const starsRef = useRef([]);
    const physicsState = useRef(
        Array.from({ length: STAR_COUNT }).map(() => ({
            position: new THREE.Vector3(
                (Math.random() - 0.5) * viewport.width,
                (Math.random() - 0.5) * viewport.height,
                (Math.random() - 0.5) * 5
            ),
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.02,
                (Math.random() - 0.5) * 0.02,
                0
            ),
            radius: 1.0 + Math.random() * 0.5 // Varied size collision radius
        }))
    );

    useFrame(() => {
        const stars = physicsState.current;

        // 1. Update positions
        stars.forEach(star => {
            star.position.add(star.velocity);

            // Wall Bounce (Viewport bounds)
            if (star.position.x > viewport.width / 2) star.velocity.x = -Math.abs(star.velocity.x);
            if (star.position.x < -viewport.width / 2) star.velocity.x = Math.abs(star.velocity.x);
            if (star.position.y > viewport.height / 2) star.velocity.y = -Math.abs(star.velocity.y);
            if (star.position.y < -viewport.height / 2) star.velocity.y = Math.abs(star.velocity.y);
        });

        // 2. Resolve Collisions (Circle-Circle check)
        for (let i = 0; i < stars.length; i++) {
            for (let j = i + 1; j < stars.length; j++) {
                const p1 = stars[i].position;
                const p2 = stars[j].position;
                const dist = p1.distanceTo(p2);
                const minDist = stars[i].radius + stars[j].radius;

                if (dist < minDist) {
                    // Collision detected! Bounce.

                    // Simple elastic collision response:
                    // 1. Separate them to prevent sticking
                    const overlap = minDist - dist;
                    const direction = p2.clone().sub(p1).normalize();
                    const separation = direction.clone().multiplyScalar(overlap * 0.5);

                    p1.sub(separation);
                    p2.add(separation);

                    // 2. Exchange normal velocities (Simple approximation)
                    // Just swapping vectors helps, or reversing along normal.
                    // Let's compute reflection.

                    const v1 = stars[i].velocity;
                    const v2 = stars[j].velocity;

                    // Swap velocities for simplicity (masses assumed equal)
                    // Or add a little randomness to avoid stuck loops
                    const temp = v1.clone();
                    v1.copy(v2);
                    v2.copy(temp);

                    // Damping (lose energy on hit)
                    // v1.multiplyScalar(0.99);
                    // v2.multiplyScalar(0.99);
                }
            }
        }

        // 3. Sync Physics to Visual Mesh
        starsRef.current.forEach((mesh, i) => {
            if (mesh) {
                mesh.position.copy(stars[i].position);
                // Simple scale based on "radius" prop we generated
                const scale = stars[i].radius * 0.8;
                if (mesh.scale.x !== scale && !mesh.userData.hover) { // Respect hover
                    mesh.scale.set(scale, scale, scale);
                }
            }
        });
    });

    return (
        <>
            <Environment preset="city" />
            <ambientLight intensity={0.7} /> {/* Increased from 0.4 */}
            <pointLight position={[10, 10, 10]} intensity={1.5} color="#cbd5e1" /> {/* Lighter color, higher intensity */}
            <pointLight position={[-10, -10, -10]} intensity={1} color="#e2e8f0" />

            {physicsState.current.map((star, i) => (
                <Star
                    key={i}
                    index={i}
                    updatePosition={(idx, el) => (starsRef.current[idx] = el)}
                    color={Math.random() > 0.5 ? '#F1F5F9' : '#E2E8F0'} // Ultra-light Slate (Platinum/Silver)
                />
            ))}
        </>
    );
};

export const BubblesBackground = () => {
    return (
        <div className="absolute inset-0 z-0 pointer-events-auto">
            <Canvas camera={{ position: [0, 0, 10], fov: 45 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
                <PhysicsScene />
            </Canvas>
        </div>
    );
};
