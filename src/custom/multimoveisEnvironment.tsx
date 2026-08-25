"use client";

import { memo } from "react";
import { useTexture } from "@react-three/drei";
import {
  FloorAndWalls as BaseFloorAndWalls,
  WallPictures as BaseWallPictures,
} from "../features/retro-office/scene/environment";
import { SCALE } from "../features/retro-office/core/constants";
import {
  LOCAL_OFFICE_CANVAS_HEIGHT,
  LOCAL_OFFICE_CANVAS_WIDTH,
  REMOTE_OFFICE_ZONE,
} from "../features/retro-office/core/district";
import { toWorld } from "../features/retro-office/core/geometry";

const BRAND_NAVY = "#172238";
const BRAND_GOLD = "#F3B747";
const FUTURE_CYAN = "#23D5FF";
const FUTURE_BLUE = "#0A1324";

function MultimoveisFuturisticOffice({
  showRemoteOffice = true,
}: {
  showRemoteOffice?: boolean;
}) {
  const officeWidth = LOCAL_OFFICE_CANVAS_WIDTH * SCALE;
  const officeHeight = LOCAL_OFFICE_CANVAS_HEIGHT * SCALE;
  const [centerX, , localCenterZ] = toWorld(
    LOCAL_OFFICE_CANVAS_WIDTH / 2,
    LOCAL_OFFICE_CANVAS_HEIGHT / 2,
  );
  const [, , remoteCenterZ] = toWorld(
    (REMOTE_OFFICE_ZONE.minX + REMOTE_OFFICE_ZONE.maxX) / 2,
    (REMOTE_OFFICE_ZONE.minY + REMOTE_OFFICE_ZONE.maxY) / 2,
  );
  const offsets = showRemoteOffice ? [0, remoteCenterZ - localCenterZ] : [0];

  return (
    <group>
      {offsets.map((offsetZ, officeIndex) => {
        const centerZ = localCenterZ + offsetZ;
        const northZ = centerZ - officeHeight / 2;
        const southZ = centerZ + officeHeight / 2;
        const westX = centerX - officeWidth / 2;
        const eastX = centerX + officeWidth / 2;

        return (
          <group key={`multimoveis-future-office-${officeIndex}`}>
            <mesh
              position={[centerX, 0.009, centerZ]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[officeWidth, officeHeight]} />
              <meshStandardMaterial
                color={FUTURE_BLUE}
                roughness={0.58}
                metalness={0.32}
              />
            </mesh>

            <mesh
              position={[centerX, 0.011, centerZ]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
            >
              <planeGeometry args={[officeWidth * 0.96, officeHeight * 0.88]} />
              <meshStandardMaterial
                color={BRAND_NAVY}
                roughness={0.46}
                metalness={0.28}
              />
            </mesh>

            {Array.from({ length: 17 }).map((_, index) => {
              const x =
                centerX - officeWidth * 0.45 +
                index * ((officeWidth * 0.9) / 16);
              return (
                <mesh
                  key={`future-grid-x-${officeIndex}-${index}`}
                  position={[x, 0.014, centerZ]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[0.012, officeHeight * 0.82]} />
                  <meshBasicMaterial
                    color={index % 4 === 0 ? BRAND_GOLD : FUTURE_CYAN}
                    transparent
                    opacity={index % 4 === 0 ? 0.34 : 0.16}
                  />
                </mesh>
              );
            })}

            {Array.from({ length: 9 }).map((_, index) => {
              const z =
                centerZ - officeHeight * 0.4 +
                index * ((officeHeight * 0.8) / 8);
              return (
                <mesh
                  key={`future-grid-z-${officeIndex}-${index}`}
                  position={[centerX, 0.014, z]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <planeGeometry args={[officeWidth * 0.9, 0.012]} />
                  <meshBasicMaterial
                    color={index % 3 === 0 ? BRAND_GOLD : FUTURE_CYAN}
                    transparent
                    opacity={index % 3 === 0 ? 0.3 : 0.14}
                  />
                </mesh>
              );
            })}

            <mesh
              position={[centerX, 0.017, centerZ]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[officeWidth * 0.74, 0.055]} />
              <meshStandardMaterial
                color={BRAND_GOLD}
                emissive={BRAND_GOLD}
                emissiveIntensity={1.25}
                roughness={0.3}
                metalness={0.18}
              />
            </mesh>

            <mesh
              position={[centerX, 0.018, centerZ - officeHeight * 0.32]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[officeWidth * 0.68, 0.025]} />
              <meshStandardMaterial
                color={FUTURE_CYAN}
                emissive={FUTURE_CYAN}
                emissiveIntensity={1.8}
              />
            </mesh>

            <mesh
              position={[centerX, 0.018, centerZ + officeHeight * 0.32]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[officeWidth * 0.68, 0.025]} />
              <meshStandardMaterial
                color={FUTURE_CYAN}
                emissive={FUTURE_CYAN}
                emissiveIntensity={1.8}
              />
            </mesh>

            <mesh position={[centerX, 0.51, northZ]} receiveShadow>
              <boxGeometry args={[officeWidth, 1.02, 0.1]} />
              <meshStandardMaterial
                color={BRAND_NAVY}
                emissive="#08111F"
                emissiveIntensity={0.5}
                roughness={0.55}
                metalness={0.24}
              />
            </mesh>
            <mesh position={[centerX, 0.51, southZ]} receiveShadow>
              <boxGeometry args={[officeWidth, 1.02, 0.1]} />
              <meshStandardMaterial
                color={BRAND_NAVY}
                emissive="#08111F"
                emissiveIntensity={0.5}
                roughness={0.55}
                metalness={0.24}
              />
            </mesh>
            <mesh position={[westX, 0.51, centerZ]} receiveShadow>
              <boxGeometry args={[0.1, 1.02, officeHeight]} />
              <meshStandardMaterial
                color={BRAND_NAVY}
                emissive="#08111F"
                emissiveIntensity={0.5}
                roughness={0.55}
                metalness={0.24}
              />
            </mesh>
            <mesh position={[eastX, 0.51, centerZ]} receiveShadow>
              <boxGeometry args={[0.1, 1.02, officeHeight]} />
              <meshStandardMaterial
                color={BRAND_NAVY}
                emissive="#08111F"
                emissiveIntensity={0.5}
                roughness={0.55}
                metalness={0.24}
              />
            </mesh>

            <mesh position={[centerX, 1.025, northZ + 0.055]}>
              <boxGeometry args={[officeWidth * 0.92, 0.025, 0.025]} />
              <meshStandardMaterial
                color={FUTURE_CYAN}
                emissive={FUTURE_CYAN}
                emissiveIntensity={2}
              />
            </mesh>
            <mesh position={[centerX, 1.025, southZ - 0.055]}>
              <boxGeometry args={[officeWidth * 0.92, 0.025, 0.025]} />
              <meshStandardMaterial
                color={BRAND_GOLD}
                emissive={BRAND_GOLD}
                emissiveIntensity={1.7}
              />
            </mesh>
            <mesh position={[westX + 0.055, 1.025, centerZ]}>
              <boxGeometry args={[0.025, 0.025, officeHeight * 0.84]} />
              <meshStandardMaterial
                color={BRAND_GOLD}
                emissive={BRAND_GOLD}
                emissiveIntensity={1.7}
              />
            </mesh>
            <mesh position={[eastX - 0.055, 1.025, centerZ]}>
              <boxGeometry args={[0.025, 0.025, officeHeight * 0.84]} />
              <meshStandardMaterial
                color={FUTURE_CYAN}
                emissive={FUTURE_CYAN}
                emissiveIntensity={2}
              />
            </mesh>

            {[
              [westX + 0.25, northZ + 0.25],
              [eastX - 0.25, northZ + 0.25],
              [westX + 0.25, southZ - 0.25],
              [eastX - 0.25, southZ - 0.25],
            ].map(([x, z], index) => (
              <group key={`future-pillar-${officeIndex}-${index}`}>
                <mesh position={[x, 0.72, z]}>
                  <cylinderGeometry args={[0.035, 0.055, 1.44, 12]} />
                  <meshStandardMaterial
                    color="#253650"
                    roughness={0.35}
                    metalness={0.72}
                  />
                </mesh>
                <mesh position={[x, 1.28, z]}>
                  <sphereGeometry args={[0.07, 12, 12]} />
                  <meshStandardMaterial
                    color={index % 2 === 0 ? BRAND_GOLD : FUTURE_CYAN}
                    emissive={index % 2 === 0 ? BRAND_GOLD : FUTURE_CYAN}
                    emissiveIntensity={2.3}
                  />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

export const FloorAndWalls = memo(function MultimoveisFloorAndWalls({
  showRemoteOffice = true,
}: {
  showRemoteOffice?: boolean;
}) {
  return (
    <>
      <BaseFloorAndWalls showRemoteOffice={showRemoteOffice} />
      <MultimoveisFuturisticOffice showRemoteOffice={showRemoteOffice} />
    </>
  );
});

function MultimoveisBrandFlagOverlay() {
  const logoTexture = useTexture("/multimoveis-logo.svg");
  const [flagPoleX, , flagPoleZ] = toWorld(
    180,
    LOCAL_OFFICE_CANVAS_HEIGHT - 110,
  );

  return (
    <group position={[flagPoleX, 0, flagPoleZ]} rotation={[0, 0.32, 0]}>
      <group position={[0.58, 2.16, 0.02]} scale={[1.9, 1.9, 1.9]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.92, 0.25, 0.02]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.72}
            metalness={0.04}
          />
        </mesh>

        <mesh position={[0, 0, 0.012]}>
          <planeGeometry args={[0.86, 0.19]} />
          <meshBasicMaterial
            map={logoTexture}
            transparent
            toneMapped={false}
            side={2}
          />
        </mesh>

        <mesh position={[0, 0, -0.012]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.86, 0.19]} />
          <meshBasicMaterial
            map={logoTexture}
            transparent
            toneMapped={false}
            side={2}
          />
        </mesh>

        <mesh position={[0, -0.155, 0]}>
          <boxGeometry args={[0.92, 0.018, 0.022]} />
          <meshStandardMaterial
            color={BRAND_GOLD}
            emissive={BRAND_GOLD}
            emissiveIntensity={1.4}
          />
        </mesh>
      </group>
    </group>
  );
}

export const WallPictures = memo(function MultimoveisWallPictures({
  showRemoteOffice = true,
}: {
  showRemoteOffice?: boolean;
}) {
  return (
    <>
      <BaseWallPictures showRemoteOffice={showRemoteOffice} />
      <MultimoveisBrandFlagOverlay />
    </>
  );
});
