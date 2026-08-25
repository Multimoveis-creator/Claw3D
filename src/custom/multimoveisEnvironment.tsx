"use client";

import { memo } from "react";
import { useTexture } from "@react-three/drei";
import {
  FloorAndWalls as BaseFloorAndWalls,
  WallPictures as BaseWallPictures,
} from "../features/retro-office/scene/environment";
import { LOCAL_OFFICE_CANVAS_HEIGHT } from "../features/retro-office/core/district";
import { toWorld } from "../features/retro-office/core/geometry";

export const FloorAndWalls = BaseFloorAndWalls;

function MultimoveisBrandFlagOverlay() {
  const logoTexture = useTexture("/multimoveis-logo.svg");
  const [flagPoleX, , flagPoleZ] = toWorld(
    180,
    LOCAL_OFFICE_CANVAS_HEIGHT - 110,
  );

  return (
    <group position={[flagPoleX, 0, flagPoleZ]} rotation={[0, 0.32, 0]}>
      <group position={[0.42, 2.16, 0.02]} scale={[1.9, 1.9, 1.9]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.56, 0.32, 0.016]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.78}
            metalness={0.02}
          />
        </mesh>

        <mesh position={[0, 0, 0.009]}>
          <planeGeometry args={[0.52, 0.28]} />
          <meshBasicMaterial
            map={logoTexture}
            transparent
            toneMapped={false}
          />
        </mesh>

        <mesh position={[0, 0, -0.009]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.52, 0.28]} />
          <meshBasicMaterial
            map={logoTexture}
            transparent
            toneMapped={false}
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
