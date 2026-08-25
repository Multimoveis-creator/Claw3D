"use client";

import { memo } from "react";
import {
  FloorAndWalls as MultimoveisFloorAndWalls,
  WallPictures as MultimoveisWallPicturesBase,
} from "./multimoveisEnvironment";
import { LOCAL_OFFICE_CANVAS_HEIGHT } from "../features/retro-office/core/district";
import { toWorld } from "../features/retro-office/core/geometry";

const BRAND_NAVY = "#172238";
const BRAND_GOLD = "#F3B747";

const PIXEL_FONT: Record<string, string[]> = {
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
};

function PixelWord({ back = false }: { back?: boolean }) {
  const text = "MULTIMOVEIS";
  const pixelW = 0.0084;
  const pixelH = 0.0185;
  const charAdvance = pixelW * 6;
  const totalWidth = charAdvance * text.length - pixelW;
  const startX = -totalWidth / 2;
  const startY = pixelH * 3;

  return (
    <group rotation={back ? [0, Math.PI, 0] : [0, 0, 0]}>
      {Array.from(text).map((character, charIndex) => {
        const pattern = PIXEL_FONT[character] ?? PIXEL_FONT.M;
        return pattern.map((row, rowIndex) =>
          Array.from(row).map((pixel, columnIndex) =>
            pixel === "1" ? (
              <mesh
                key={`${charIndex}-${rowIndex}-${columnIndex}`}
                position={[
                  startX + charIndex * charAdvance + columnIndex * pixelW,
                  startY - rowIndex * pixelH,
                  0,
                ]}
              >
                <boxGeometry args={[pixelW * 0.82, pixelH * 0.78, 0.006]} />
                <meshBasicMaterial color={BRAND_NAVY} />
              </mesh>
            ) : null,
          ),
        );
      })}

      {/* Accent over the O in MULTIMÓVEIS. */}
      <mesh
        position={[
          startX + 6 * charAdvance + pixelW * 2.7,
          startY + pixelH * 0.72,
          0,
        ]}
        rotation={[0, 0, -0.45]}
      >
        <boxGeometry args={[pixelW * 1.6, pixelH * 0.34, 0.006]} />
        <meshBasicMaterial color={BRAND_NAVY} />
      </mesh>
    </group>
  );
}

function BrandMark({ back = false }: { back?: boolean }) {
  return (
    <group
      position={[-0.405, 0, 0]}
      rotation={back ? [0, Math.PI, 0] : [0, 0, 0]}
    >
      <mesh position={[-0.036, 0, 0]} rotation={[0, 0, 0.32]}>
        <boxGeometry args={[0.052, 0.145, 0.008]} />
        <meshBasicMaterial color={BRAND_GOLD} />
      </mesh>
      <mesh position={[0.012, 0.01, 0]} rotation={[0, 0, -0.32]}>
        <boxGeometry args={[0.052, 0.13, 0.008]} />
        <meshBasicMaterial color={BRAND_GOLD} />
      </mesh>
      <mesh position={[0.056, 0.008, 0]}>
        <boxGeometry args={[0.032, 0.136, 0.008]} />
        <meshBasicMaterial color={BRAND_GOLD} />
      </mesh>
    </group>
  );
}

function MultimoveisReadableLogoOverlay() {
  const [flagPoleX, , flagPoleZ] = toWorld(
    180,
    LOCAL_OFFICE_CANVAS_HEIGHT - 110,
  );

  return (
    <group position={[flagPoleX, 0, flagPoleZ]} rotation={[0, 0.32, 0]}>
      <group position={[0.49, 2.16, 0.055]} scale={[1.9, 1.9, 1.9]}>
        {/* Large plate fully covers the original USA flag and the previous blank plate. */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.15, 0.38, 0.026]} />
          <meshStandardMaterial
            color="#ffffff"
            roughness={0.68}
            metalness={0.05}
          />
        </mesh>

        <mesh position={[0, -0.205, 0]}>
          <boxGeometry args={[1.15, 0.022, 0.03]} />
          <meshStandardMaterial
            color={BRAND_GOLD}
            emissive={BRAND_GOLD}
            emissiveIntensity={1.2}
          />
        </mesh>

        {/* Front face: geometric logo, no SVG/font loading required. */}
        <group position={[0.08, 0, 0.017]}>
          <BrandMark />
          <group position={[0.105, 0, 0]} scale={[1.18, 1.18, 1]}>
            <PixelWord />
          </group>
        </group>

        {/* Back face so the brand remains readable from either camera angle. */}
        <group position={[0.08, 0, -0.017]}>
          <BrandMark back />
          <group position={[0.105, 0, 0]} scale={[1.18, 1.18, 1]}>
            <PixelWord back />
          </group>
        </group>
      </group>
    </group>
  );
}

export const FloorAndWalls = MultimoveisFloorAndWalls;

export const WallPictures = memo(function MultimoveisFinalWallPictures({
  showRemoteOffice = true,
}: {
  showRemoteOffice?: boolean;
}) {
  return (
    <>
      <MultimoveisWallPicturesBase showRemoteOffice={showRemoteOffice} />
      <MultimoveisReadableLogoOverlay />
    </>
  );
});
