import * as THREE from 'three';
import Papa from 'papaparse';

// CSVファイルの結果型定義
interface CSVResult {
  positions: Float32Array;
  colors: Float32Array;
  originalData: unknown[];
  zValues: number[];
  hasRGB: boolean;
}

// PCDファイルの結果型定義
interface PCDResult {
  positions: Float32Array;
  colors: Float32Array;
  originalData: Array<number[]>;
  hasColor: boolean;
  zValues: number[];
}

/**
 * CSVファイルを読み込んで点群データに変換する
 */
export const loadCSV = async (
  file: File, 
  colorMapType: string = 'default',
  updateHeightBounds?: (min: number, max: number) => void
): Promise<CSVResult> => {
  return new Promise<CSVResult>((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const positions: number[] = [];
          const zValues: number[] = [];
          const colors: number[] = [];
          const hasRGB = results.data[0] && (results.data[0] as Array<number>).length >= 6;
          
          // 有効なデータ数をカウント
          let validPointCount = 0;
          
          results.data.forEach((row: unknown) => {
            const dataRow = row as number[];
            if (Array.isArray(dataRow) && dataRow.length >= 3) {
              // NaNや無限大の値をチェック
              const x = dataRow[0];
              const y = dataRow[1];
              const z = dataRow[2];
              
              if (isNaN(x) || isNaN(y) || isNaN(z) || 
                  !isFinite(x) || !isFinite(y) || !isFinite(z)) {
                // 無効なデータはスキップ
                return;
              }
              
              // 必ず位置データは読み込む
              positions.push(x, y, z); // X,Y,Z
              zValues.push(z); // Z値を保存
              validPointCount++;
              
              // RGB情報がある場合は使用（0-255の値を0-1に正規化）
              if (hasRGB && dataRow.length >= 6) {
                // RGB値もチェック
                const r = dataRow[3];
                const g = dataRow[4];
                const b = dataRow[5];
                
                // RGB値のバリデーション (0～255の範囲に収める)
                const validR = isNaN(r) ? 128 : Math.max(0, Math.min(255, r));
                const validG = isNaN(g) ? 128 : Math.max(0, Math.min(255, g));
                const validB = isNaN(b) ? 128 : Math.max(0, Math.min(255, b));
                
                colors.push(
                  validR / 255, // R
                  validG / 255, // G
                  validB / 255  // B
                );
              }
            }
          });
          
          // 有効なデータが見つからない場合
          if (validPointCount === 0) {
            throw new Error('有効な点群データが見つかりませんでした。CSVファイル形式を確認してください。');
          }
          
          console.log(`CSVファイル読み込み完了: ${validPointCount} 点を読み込みました`);
          
          const positionArray = new Float32Array(positions);
          
          // RGB情報があれば使用、なければZ値でカラーマップを生成
          const colorArray = hasRGB ? 
            new Float32Array(colors) : 
            createColorMapForCSV(zValues, colorMapType);
          
          // 高さの最小値・最大値を更新
          if (zValues.length > 0 && updateHeightBounds) {
            const minZ = Math.min(...zValues);
            const maxZ = Math.max(...zValues);
            
            // 全点群の高さ範囲を更新
            updateHeightBounds(minZ, maxZ);
          }
          
          resolve({
            positions: positionArray,
            colors: colorArray,
            originalData: results.data,
            zValues,
            hasRGB: Boolean(hasRGB)
          });
        } catch (err) {
          console.error('CSVファイル解析エラー:', err);
          reject(err);
        }
      },
      error: (error) => {
        console.error('CSVパースエラー:', error);
        reject(error);
      }
    });
  });
};

/**
 * PCDファイルを読み込んで点群データに変換する
 */
export const loadPCD = async (
  file: File,
  updateHeightBounds?: (min: number, max: number) => void
): Promise<PCDResult> => {
  return new Promise<PCDResult>(async (resolve, reject) => {
    const fileReader = new FileReader();
    
    fileReader.onload = async (event) => {
      // PCDファイルのURLを作成
      let fileUrl = '';
      
      try {
        const PCDLoaderModule = await import('three/examples/jsm/loaders/PCDLoader');
        const PCDLoader = PCDLoaderModule.PCDLoader;
        const loader = new PCDLoader();
        const buffer = event.target?.result as ArrayBuffer;
        
        if (!buffer) {
          throw new Error('ファイルの読み込みに失敗しました');
        }
        
        // ファイルURLの作成
        fileUrl = URL.createObjectURL(new Blob([buffer]));
        
        try {
          // PCDファイルの直接解析を試みる
          const positions: number[] = [];
          const colors: number[] = [];
          const text = new TextDecoder().decode(new Uint8Array(buffer));
          
          // PCD形式かどうかの基本チェック
          if (!text.startsWith('# .PCD') && !text.includes('VERSION')) {
            throw new Error('有効なPCDフォーマットではありません');
          }
          
          // ヘッダー部分を解析
          const lines = text.split('\n');
          let dataStartLine = 0;
          let pointCount = 0;
          let hasColor = false;
          let isASCII = false;
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('POINTS')) {
              pointCount = parseInt(line.split(' ')[1]);
            } else if (line.startsWith('FIELDS')) {
              hasColor = line.includes('rgb') || line.includes('r') || line.includes('rgba');
            } else if (line.startsWith('DATA')) {
              isASCII = line.includes('ascii');
              dataStartLine = i + 1;
              break;
            }
          }
          
          // ASCII形式のPCDファイルを直接解析
          if (isASCII && pointCount > 0) {
            for (let i = dataStartLine; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              
              const values = line.split(/\s+/).map(Number);
              if (values.length >= 3) {
                positions.push(values[0], values[1], values[2]);
                
                // 色情報がある場合
                if (hasColor && values.length >= 6) {
                  colors.push(values[3] / 255, values[4] / 255, values[5] / 255);
                }
              }
            }
            
            if (positions.length > 0) {
              // 自前で解析したデータを使用
              const posArray = new Float32Array(positions);
              let colorArray;
              
              if (colors.length > 0) {
                colorArray = new Float32Array(colors);
              } else {
                // 色情報がない場合はデフォルト色
                colorArray = createSingleColorForPCD(positions.length / 3);
              }
              
              // Z値を抽出
              const zValues: number[] = [];
              for (let i = 0; i < positions.length / 3; i++) {
                zValues.push(positions[i * 3 + 2]);
              }
              
              // 高さ範囲の更新
              if (zValues.length > 0 && updateHeightBounds) {
                updateHeightBounds(Math.min(...zValues), Math.max(...zValues));
              }
              
              // 元データの作成
              const originalData: Array<number[]> = [];
              for (let i = 0; i < positions.length / 3; i++) {
                originalData.push([
                  positions[i * 3],
                  positions[i * 3 + 1],
                  positions[i * 3 + 2],
                  Math.round(colorArray[i * 3] * 255),
                  Math.round(colorArray[i * 3 + 1] * 255),
                  Math.round(colorArray[i * 3 + 2] * 255)
                ]);
              }
              
              resolve({
                positions: posArray,
                colors: colorArray,
                originalData,
                hasColor: colors.length > 0,
                zValues
              });
              return;
            }
          }
          
          // Three.jsのPCDLoaderを試す
          const pointcloud = await new Promise<THREE.Group>((res, rej) => {
            loader.load(
              fileUrl,
              (pcd) => {
                if (pcd instanceof THREE.Group) {
                  res(pcd);
                } else {
                  // Groupではないオブジェクトの場合でも変換を試みる
                  const group = new THREE.Group();
                  group.add(pcd);
                  res(group);
                }
              },
              undefined,
              (error) => rej(new Error(`PCDファイルの解析エラー: ${error}`))
            );
          });
          
          if (!pointcloud.children || pointcloud.children.length === 0) {
            throw new Error('点群データが空です');
          }
          
          // 最初の子要素を使用
          const pointMesh = pointcloud.children[0];
          let geometry;
          
          // Points型でなくてもジオメトリを取得しようとする
          if (pointMesh instanceof THREE.Points) {
            geometry = pointMesh.geometry;
          } else if (pointMesh instanceof THREE.Object3D && 'geometry' in pointMesh) {
            geometry = (pointMesh as THREE.Object3D & { geometry: THREE.BufferGeometry }).geometry;
          } else {
            throw new Error('有効な点群メッシュが見つかりません');
          }
          
          if (!geometry || !geometry.attributes || !geometry.attributes.position) {
            throw new Error('ジオメトリデータが無効です');
          }
          
          // 位置データ取得
          const positionAttribute = geometry.attributes.position;
          const positionsArray = positionAttribute.array as Float32Array;
          
          // 色情報の取得またはデフォルト色の作成
          let colorsArray: Float32Array;
          const hasColorAttrib = geometry.attributes.color !== undefined;
          
          if (hasColorAttrib && geometry.attributes.color) {
            colorsArray = geometry.attributes.color.array as Float32Array;
          } else {
            colorsArray = createSingleColorForPCD(positionsArray.length / 3);
          }
          
          // Z値を抽出して高さ範囲を更新
          const zValuesArray: number[] = [];
          const pointCountVal = positionsArray.length / 3;
          
          for (let i = 0; i < pointCountVal; i++) {
            zValuesArray.push(positionsArray[i * 3 + 2]);
          }
          
          // 高さの最小値・最大値を更新
          if (zValuesArray.length > 0 && updateHeightBounds) {
            const minZ = Math.min(...zValuesArray);
            const maxZ = Math.max(...zValuesArray);
            updateHeightBounds(minZ, maxZ);
          }
          
          // 元のデータを配列に変換（エクスポート用に位置と色を保持）
          const originalDataArray: Array<number[]> = [];
          
          for (let i = 0; i < pointCountVal; i++) {
            originalDataArray.push([
              positionsArray[i * 3],
              positionsArray[i * 3 + 1],
              positionsArray[i * 3 + 2],
              Math.round(colorsArray[i * 3] * 255),
              Math.round(colorsArray[i * 3 + 1] * 255),
              Math.round(colorsArray[i * 3 + 2] * 255)
            ]);
          }
          
          resolve({
            positions: positionsArray,
            colors: colorsArray,
            originalData: originalDataArray,
            hasColor: hasColorAttrib,
            zValues: zValuesArray
          });
        } catch (err) {
          console.error('PCDLoader読み込みエラー:', err);
          reject(err);
        }
      } catch (err) {
        console.error('PCD読み込みエラー:', err);
        reject(err);
      } finally {
        // URLオブジェクトを解放
        if (fileUrl) {
          URL.revokeObjectURL(fileUrl);
        }
      }
    };
    
    fileReader.onerror = () => reject(new Error('ファイルの読み取りに失敗しました'));
    fileReader.readAsArrayBuffer(file);
  });
};

/**
 * Z値に基づいたカラーマップの生成
 */
export const createColorMapForCSV = (zValues: number[], mapType: string = 'default') => {
  // Z値の最小・最大を取得
  const min = Math.min(...zValues);
  const max = Math.max(...zValues);
  const range = max - min;
  
  // Z値に基づいた色を生成
  const colors = new Float32Array(zValues.length * 3);
  
  zValues.forEach((z, i) => {
    const normalized = (z - min) / range; // 0～1に正規化
    let r, g, b;
    
    switch (mapType) {
      case 'rainbow':
        // 虹色グラデーション
        const hue = (1 - normalized) * 270; // 青から赤へ
        const [rH, gH, bH] = HSVtoRGB(hue / 360, 1, 1);
        r = rH;
        g = gH;
        b = bH;
        break;
        
      case 'elevation':
        // 標高マップ
        if (normalized < 0.2) { // 青 → シアン
          r = 0;
          g = normalized * 5;
          b = 1;
        } else if (normalized < 0.4) { // シアン → 緑
          r = 0;
          g = 1;
          b = 1 - (normalized - 0.2) * 5;
        } else if (normalized < 0.6) { // 緑 → 黄
          r = (normalized - 0.4) * 5;
          g = 1;
          b = 0;
        } else if (normalized < 0.8) { // 黄 → 赤
          r = 1;
          g = 1 - (normalized - 0.6) * 5;
          b = 0;
        } else { // 赤 → 白
          r = 1;
          g = (normalized - 0.8) * 5;
          b = (normalized - 0.8) * 5;
        }
        break;
        
      default: // デフォルトカラーマップ（青→緑→赤）
        if (normalized < 0.5) {
          // 青から緑へ
          b = 1 - normalized * 2;
          g = normalized * 2;
          r = 0;
        } else {
          // 緑から赤へ
          b = 0;
          g = 1 - (normalized - 0.5) * 2;
          r = (normalized - 0.5) * 2;
        }
    }
    
    colors[i*3] = r;
    colors[i*3+1] = g;
    colors[i*3+2] = b;
  });
  
  return colors;
};

/**
 * HSV to RGB 変換ヘルパー関数
 */
export function HSVtoRGB(h: number, s: number, v: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  
  switch (i % 6) {
    case 0: 
      r = v; g = t; b = p; 
      break;
    case 1: 
      r = q; g = v; b = p; 
      break;
    case 2: 
      r = p; g = v; b = t; 
      break;
    case 3: 
      r = p; g = q; b = v; 
      break;
    case 4: 
      r = t; g = p; b = v; 
      break;
    case 5: 
      r = v; g = p; b = q; 
      break;
  }
  
  return [r, g, b];
}

/**
 * PCD用の単色生成
 */
export const createSingleColorForPCD = (pointCount: number) => {
  const colors = new Float32Array(pointCount * 3);
  const color = { r: 0.7, g: 0.7, b: 0.7 }; // グレー
  
  for (let i = 0; i < pointCount; i++) {
    colors[i*3] = color.r;
    colors[i*3+1] = color.g;
    colors[i*3+2] = color.b;
  }
  
  return colors;
};