'use client';

import React, { useRef, useEffect, useCallback, useContext } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { AppContext } from './PointCloudApp';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// マップコントロール（Z軸上空からの視点用）
export const MapControls = () => {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  
  useEffect(() => {
    // カメラの初期設定
    if (camera) {
      // Z軸上空からの視点（編集モード）に設定
      camera.position.set(0, 100, 0);
      camera.lookAt(0, 0, 0);
      
      // 平行投影に変更
      camera.near = 0.1; // 負の値は避ける
      camera.far = 2000;
      camera.updateProjectionMatrix();
    }
    
    // コントロールの設定は参照があるときのみ
    if (controlsRef.current) {
      controlsRef.current.enableRotate = false;
      controlsRef.current.screenSpacePanning = true;
    }
  }, [camera]);
  
  return (
    <OrbitControls 
      ref={controlsRef} 
      makeDefault
      enableDamping={false}
    />
  );
};

interface PointCloudSceneProps {
  pointClouds: any[];
  selectedPoints: string[];
  editMode: boolean;
  activeTransform: string | null;
  onSelect: (id: string) => void;
  pointSize: number;
}

// 3Dシーンコンポーネント
export const PointCloudScene: React.FC<PointCloudSceneProps> = ({ 
  pointClouds, 
  selectedPoints, 
  editMode, 
  activeTransform,
  onSelect,
  pointSize
}) => {
  const { scene, camera } = useThree();
  const transformRef = useRef<any>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl>(null);
  const selectedGroupRef = useRef(new THREE.Group());
  const { heightFilterEnabled, heightRange } = useContext(AppContext);
  
  // カメラの初期設定
  useEffect(() => {
    if (camera) {
      camera.position.set(0, 0, 50);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
  }, [camera]);
  
  // TransformControlsの設定
  useEffect(() => {
    if (transformRef.current && selectedGroupRef.current) {
      if (activeTransform && selectedPoints.length > 0) {
        transformRef.current.attach(selectedGroupRef.current);
        transformRef.current.setMode(activeTransform as "translate" | "rotate" | "scale");
      } else {
        transformRef.current.detach();
      }
    }
  }, [activeTransform, selectedPoints]);
  
  // 選択グループの更新
  useEffect(() => {
    if (!selectedGroupRef.current || !scene) return;
    
    // 一旦グループをクリア
    while (selectedGroupRef.current.children.length > 0) {
      selectedGroupRef.current.remove(selectedGroupRef.current.children[0]);
    }
    
    // 選択された点群をグループに追加
    scene.children.forEach(child => {
      if (child.userData && selectedPoints.includes(child.userData.id)) {
        // 元の点群の参照を保持
        selectedGroupRef.current.add(child);
      }
    });
    
    // シーンにグループを追加（まだ追加されていない場合）
    if (!scene.children.includes(selectedGroupRef.current)) {
      scene.add(selectedGroupRef.current);
    }
  }, [selectedPoints, scene]);
  
  // 高さフィルター適用
  const applyHeightFilter = useCallback((positions: Float32Array) => {
    if (!heightFilterEnabled) return null; // フィルターが無効ならnullを返す
    
    const visibleIndices = [];
    const pointCount = positions.length / 3;
    
    for (let i = 0; i < pointCount; i++) {
      const z = positions[i * 3 + 2]; // Z座標
      
      // 高さ範囲内なら表示
      if (z >= heightRange[0] && z <= heightRange[1]) {
        visibleIndices.push(i);
      }
    }
    
    return visibleIndices;
  }, [heightFilterEnabled, heightRange]);
  
  return (
    <>
      {/* 各点群のレンダリング */}
      {pointClouds.filter(pc => pc.visible).map(pc => {
        // 高さフィルターの適用
        const visibleIndices = applyHeightFilter(pc.data.positions);
        
        return (
          <points
            key={pc.id}
            userData={{ id: pc.id }}
            onClick={() => onSelect(pc.id)}
          >
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={pc.data.positions.length / 3}
                array={pc.data.positions}
                itemSize={3}
              />
              <bufferAttribute
                attach="attributes-color"
                count={pc.data.colors.length / 3}
                array={pc.data.colors}
                itemSize={3}
              />
              {/* 高さフィルターが有効な場合、表示する点のインデックスを設定 */}
              {heightFilterEnabled && visibleIndices && (
                <bufferAttribute
                  attach="index"
                  array={new Uint16Array(visibleIndices)}
                  itemSize={1}
                />
              )}
            </bufferGeometry>
            <pointsMaterial
              size={pointSize}
              vertexColors
              transparent
              opacity={selectedPoints.includes(pc.id) ? 1.0 : 0.8}
              // 選択状態を視覚的に表現
              sizeAttenuation={selectedPoints.includes(pc.id)}
            />
          </points>
        );
      })}
      
      {/* 変換コントロール（編集モード時のみ） */}
      {editMode && activeTransform && (
        <TransformControls
          ref={transformRef}
          mode={activeTransform as "translate" | "rotate" | "scale"}
          size={1}
          showX={true}
          showY={true}
          showZ={activeTransform === "translate"}
          rotationSnap={Math.PI / 16} // 回転を15度単位に
        />
      )}
      
      {/* グリッド表示（編集モード時のみ） */}
      {editMode && (
        <gridHelper args={[100, 100]} position={[0, -0.01, 0]} />
      )}
      
      {/* 座標軸ガイド */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport />
      </GizmoHelper>
      
      {/* カメラコントロール（モードに応じて切り替え） */}
      {editMode ? (
        <MapControls />
      ) : (
        <OrbitControls 
          ref={orbitControlsRef}
          makeDefault
          enableDamping={false}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
        />
      )}
    </>
  );
};